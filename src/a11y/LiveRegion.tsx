import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { announcer } from './announce';
import type { Announcement } from './announce';

const HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** Mount một lần ở gốc ứng dụng. Hai vùng riêng: polite (status) và assertive (alert). */
export function LiveRegion() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  useEffect(
    () =>
      announcer.subscribe((a: Announcement) => {
        // Xóa rồi đặt lại sau một nhịp để lặp cùng câu vẫn được đọc.
        const set = a.politeness === 'assertive' ? setAssertive : setPolite;
        set('');
        window.setTimeout(() => set(a.message), 50);
      }),
    [],
  );
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" style={HIDDEN}>
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" style={HIDDEN}>
        {assertive}
      </div>
    </>
  );
}
