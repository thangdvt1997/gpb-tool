import fs from 'node:fs';
import { Router } from 'express';
import { writeAudit } from '../db.js';
import { notify } from '../notifier.js';
import { ApiError, cleanText, newId, oneOf, requireObject } from '../util.js';

export const TICKET_CATEGORIES = Object.freeze([
  'Tài khoản / mật khẩu',
  'Phần mềm',
  'Phần cứng',
  'Mạng',
  'Khác',
]);
const TICKET_PRIORITIES = Object.freeze(['P3', 'P2']);
const INCIDENT_SEVERITIES = Object.freeze(['P1', 'P2']);
const SERVICE_STATUSES = Object.freeze(['ok', 'warn', 'down']);
const SECURITY_ROLES = Object.freeze(['it', 'admin']);

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new ApiError(503, 'Không đọc được dữ liệu, thử lại sau');
  }
}

function loadServices(file) {
  const list = readJsonFile(file);
  if (!Array.isArray(list)) throw new ApiError(503, 'Dữ liệu dịch vụ không hợp lệ');
  return list
    .filter((s) => s && typeof s.id === 'string' && SERVICE_STATUSES.includes(s.status))
    .map((s) => ({
      id: s.id,
      name: String(s.name ?? s.id),
      status: s.status,
      updatedAt: String(s.updatedAt ?? ''),
      owner: String(s.owner ?? ''),
    }));
}

function loadSecuritySummary(file) {
  const s = readJsonFile(file);
  if (!s || typeof s !== 'object') throw new ApiError(503, 'Dữ liệu bảo mật không hợp lệ');
  const count = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    critical: count(s.critical),
    high: count(s.high),
    medium: count(s.medium),
    low: count(s.low),
    updatedAt: String(s.updatedAt ?? ''),
    note: String(s.note ?? ''),
  };
}

// Kiểm tra nội dung sự cố (dùng cho bước 1 và để đối chiếu ở bước 2).
function parseIncident(body) {
  return {
    severity: oneOf(body.severity, INCIDENT_SEVERITIES, 'Mức độ sự cố chỉ được là P1 hoặc P2'),
    title: cleanText(body.title, { label: 'Tiêu đề', min: 3, max: 120 }),
    description: cleanText(body.description, { label: 'Mô tả', max: 2000, multiline: true, optional: true }),
  };
}

export function createItRouter({ db, confirms, servicesFile, securityFile }) {
  const router = Router();

  router.get('/services', (req, res) => {
    res.json(loadServices(servicesFile));
  });

  router.get('/incidents/open', (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, severity, title, started_at AS startedAt
         FROM incidents WHERE status = 'open' ORDER BY started_at DESC`,
      )
      .all();
    res.json(rows);
  });

  router.get('/security/summary', (req, res) => {
    if (!SECURITY_ROLES.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Không có quyền' });
    }
    res.json(loadSecuritySummary(securityFile));
  });

  router.post('/tickets', (req, res) => {
    const body = requireObject(req.body);
    const user = req.user;
    const category = oneOf(body.category, TICKET_CATEGORIES, 'Danh mục không hợp lệ');
    const title = cleanText(body.title, { label: 'Tiêu đề', min: 3, max: 120 });
    const description = cleanText(body.description, {
      label: 'Mô tả',
      max: 2000,
      multiline: true,
      optional: true,
    });
    const priority =
      body.priority === undefined
        ? 'P3'
        : oneOf(body.priority, TICKET_PRIORITIES, 'Mức ưu tiên chỉ được là P3 hoặc P2');

    const ticketId = newId('TK');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO tickets (id, category, title, description, priority, status,
                              requester_id, requester_email, created_at)
         VALUES (?, ?, ?, ?, ?, 'received', ?, ?, ?)`,
      ).run(
        ticketId,
        category,
        title,
        description,
        priority,
        user.id,
        user.email || '',
        new Date().toISOString(),
      );
      writeAudit(db, user, {
        action: 'ticket.create',
        target: ticketId,
        payload: { category, title, description, priority },
      });
    })();

    res.status(201).json({ ok: true, ticketId, status: 'received' });
  });

  // Hai bước: (1) gửi nội dung, nhận confirmToken; (2) gửi lại kèm confirmToken để tạo sự cố.
  router.post('/incidents', (req, res) => {
    const body = requireObject(req.body);
    const user = req.user;

    if (body.confirmToken === undefined) {
      const payload = parseIncident(body);
      const confirmToken = confirms.issue(user.id, payload);
      return res.status(200).json({
        ok: true,
        needsConfirm: true,
        confirmToken,
        expiresIn: confirms.ttlSeconds,
      });
    }

    if (typeof body.confirmToken !== 'string' || body.confirmToken === '') {
      throw new ApiError(400, 'Mã xác nhận không hợp lệ');
    }
    const pending = confirms.take(body.confirmToken, user.id);
    if (!pending) {
      throw new ApiError(400, 'Mã xác nhận không hợp lệ hoặc đã hết hạn, hãy gửi lại yêu cầu');
    }
    // Nếu bước 2 có gửi lại nội dung, nội dung phải khớp với nội dung đã xác nhận ở bước 1.
    if (body.severity !== undefined || body.title !== undefined || body.description !== undefined) {
      const sent = parseIncident(body);
      if (
        sent.severity !== pending.severity ||
        sent.title !== pending.title ||
        sent.description !== pending.description
      ) {
        throw new ApiError(400, 'Nội dung không khớp với yêu cầu đã xác nhận, hãy gửi lại');
      }
    }

    const incidentId = newId('INC');
    db.transaction(() => {
      db.prepare(
        `INSERT INTO incidents (id, severity, title, description, status, started_at,
                                created_by_id, created_by)
         VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
      ).run(
        incidentId,
        pending.severity,
        pending.title,
        pending.description,
        new Date().toISOString(),
        user.id,
        user.email || '',
      );
      writeAudit(db, user, {
        action: 'incident.create',
        target: incidentId,
        payload: pending,
      });
    })();

    try {
      notify({ type: 'incident.created', id: incidentId, severity: pending.severity });
    } catch {
      // Lỗi thông báo không được làm hỏng việc đã tạo sự cố.
    }
    res.status(201).json({ ok: true, incidentId, status: 'open' });
  });

  return router;
}
