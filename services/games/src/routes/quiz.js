import crypto from 'node:crypto';
import { Router } from 'express';
import { QUESTIONS } from '../data/questions.js';
import { ApiError, createRateLimiter, displayName, integerInRange, newId, nowIso, requireObject } from '../util.js';

const ROUND_SIZE = 5;
const CHOICE_COUNT = 4;
const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

// Chọn ngẫu nhiên count câu khác nhau (Fisher-Yates với crypto.randomInt).
function pickQuestionIds(count) {
  const ids = QUESTIONS.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}

// Câu hỏi gửi cho client: không có đáp án đúng.
function publicQuestion(question) {
  return { id: question.id, text: question.text, choices: [...question.choices] };
}

export function createQuizRouter({ db }) {
  const router = Router();

  const selectRound = db.prepare('SELECT * FROM quiz_rounds WHERE id = ?');
  const abandonOpen = db.prepare("UPDATE quiz_rounds SET status = 'abandoned' WHERE user_id = ? AND status = 'open'");
  const insertRound = db.prepare(
    "INSERT INTO quiz_rounds (id, user_id, question_ids, status, created_at) VALUES (?, ?, ?, 'open', ?)",
  );
  const selectAnswer = db.prepare('SELECT 1 FROM quiz_answers WHERE round_id = ? AND question_id = ?');
  const insertAnswer = db.prepare(
    'INSERT INTO quiz_answers (round_id, question_id, choice, correct, answered_at) VALUES (?, ?, ?, ?, ?)',
  );
  const selectAnswers = db.prepare('SELECT question_id, choice, correct FROM quiz_answers WHERE round_id = ?');
  const finishRoundStmt = db.prepare("UPDATE quiz_rounds SET status = 'finished', finished_at = ? WHERE id = ?");
  const insertScore = db.prepare(
    'INSERT INTO scores (user_id, user_name, kind, points, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  // Chống spam tạo ván: tối đa 10 ván mỗi phút cho mỗi người.
  const roundLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    message: 'Bắt đầu ván quá nhanh, hãy thử lại sau ít phút',
  });

  function findOwnedRound(roundId, userId) {
    const round = selectRound.get(roundId);
    if (!round) throw new ApiError(404, 'Không tìm thấy ván chơi');
    if (round.user_id !== userId) throw new ApiError(403, 'Ván chơi này không thuộc về bạn');
    return round;
  }

  // Ván cũ còn mở của người này bị đánh dấu bỏ, không tính điểm.
  const startRound = db.transaction((userId, roundId, questionIds, now) => {
    abandonOpen.run(userId);
    insertRound.run(roundId, userId, JSON.stringify(questionIds), now);
  });

  // Chỉ ghi nhận câu trả lời, không trả đáp án: đáp án chỉ lộ khi kết thúc ván.
  const answerQuestion = db.transaction((roundId, userId, questionId, choice) => {
    const round = findOwnedRound(roundId, userId);
    if (round.status !== 'open') throw new ApiError(409, 'Ván chơi đã kết thúc');
    const questionIds = JSON.parse(round.question_ids);
    if (!questionIds.includes(questionId)) {
      throw new ApiError(400, 'Câu hỏi không thuộc ván chơi này');
    }
    if (selectAnswer.get(roundId, questionId)) {
      throw new ApiError(409, 'Câu hỏi này đã được trả lời');
    }
    const question = QUESTION_BY_ID.get(questionId);
    const correct = choice === question.answer ? 1 : 0;
    insertAnswer.run(roundId, questionId, choice, correct, nowIso());
  });

  // Kết thúc ván: trả điểm, đáp án đúng và lựa chọn của người chơi cho các câu đã trả lời, theo thứ tự trong ván.
  // Ván không có câu nào được trả lời thì không ghi dòng điểm.
  const finishQuiz = db.transaction((roundId, user) => {
    const round = findOwnedRound(roundId, user.id);
    if (round.status !== 'open') throw new ApiError(409, 'Ván chơi đã kết thúc');
    const now = nowIso();
    const questionIds = JSON.parse(round.question_ids);
    const answered = new Map(selectAnswers.all(roundId).map((row) => [row.question_id, row]));
    const results = [];
    let score = 0;
    for (const questionId of questionIds) {
      const row = answered.get(questionId);
      if (!row) continue;
      score += row.correct;
      results.push({
        questionId,
        correctIndex: QUESTION_BY_ID.get(questionId).answer,
        chosen: row.choice,
      });
    }
    finishRoundStmt.run(now, roundId);
    if (results.length > 0) insertScore.run(user.id, displayName(user), 'quiz', score, now);
    return { score, total: questionIds.length, results };
  });

  router.post('/round', (req, res) => {
    roundLimiter.take(req.user.id);
    const questionIds = pickQuestionIds(ROUND_SIZE);
    const roundId = newId('QUIZ');
    startRound(req.user.id, roundId, questionIds, nowIso());
    res.status(201).json({
      roundId,
      questions: questionIds.map((id) => publicQuestion(QUESTION_BY_ID.get(id))),
    });
  });

  router.post('/round/:roundId/answer', (req, res) => {
    const body = requireObject(req.body ?? {});
    const questionId = integerInRange(body.questionId, 'Mã câu hỏi', 1, QUESTIONS.length);
    const choice = integerInRange(body.choice, 'Đáp án', 0, CHOICE_COUNT - 1);
    answerQuestion(req.params.roundId, req.user.id, questionId, choice);
    res.json({ ok: true });
  });

  router.post('/round/:roundId/finish', (req, res) => {
    res.json(finishQuiz(req.params.roundId, req.user));
  });

  return router;
}
