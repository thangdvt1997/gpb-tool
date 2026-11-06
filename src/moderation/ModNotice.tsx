import type { Notice } from '../ui/api';

/**
 * Vùng thông báo luôn có mặt trong cây DOM để trình đọc màn hình đọc được nội dung mới.
 * Lỗi dùng aria-live="assertive", thành công dùng "polite".
 */
export function ModNotice({ notice }: { notice: Notice | null }) {
  return (
    <>
      <div className="ui-banner ui-banner-ok" aria-live="polite" aria-atomic="true">
        {notice?.kind === 'ok' ? notice.text : ''}
      </div>
      <div className="ui-banner ui-banner-danger" aria-live="assertive" aria-atomic="true">
        {notice?.kind === 'err' ? notice.text : ''}
      </div>
    </>
  );
}
