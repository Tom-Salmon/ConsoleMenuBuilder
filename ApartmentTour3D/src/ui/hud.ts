/**
 * רכיבי ה-HUD: כוונת, כרטיס מידע על מה שתחת הכוונת, סרגל מצב ומסך פתיחה.
 */

export interface InfoContent {
  title: string;
  meta?: string;
  note?: string;
}

export class Hud {
  private readonly crosshair = document.createElement('div');
  private readonly info = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly splash = document.createElement('div');

  constructor(container: HTMLElement, onStart: () => void) {
    this.crosshair.className = 'crosshair';
    container.appendChild(this.crosshair);

    this.info.className = 'info-card';
    this.info.hidden = true;
    container.appendChild(this.info);

    this.status.className = 'status';
    container.appendChild(this.status);

    this.splash.className = 'splash';
    this.splash.innerHTML = `
      <div class="card">
        <h1>סיור תלת־ממדי בדירה</h1>
        <p>
          כלניות 17, טירת הכרמל — דירת טיפוס C.<br>
          המודל נבנה מתוך תכנית ה-PDF בקנה מידה 1:50, וכל המידות עוגנו בקווי המידה שבתכנית.
        </p>
        <div class="keys">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> תנועה</div>
          <div><kbd>Q</kbd><kbd>E</kbd> מעלה / מטה (מצב מרחף)</div>
          <div><kbd>עכבר</kbd> הסתכלות</div>
          <div><kbd>Shift</kbd> מהיר · <kbd>Ctrl</kbd> איטי</div>
          <div><kbd>לחיצה</kbd> פתיחת דלת / הפעלת מתג</div>
          <div><kbd>C</kbd> נעילת סימון מעגל</div>
          <div><kbd>X</kbd> מצב רנטגן</div>
          <div><kbd>M</kbd> כלי מדידה</div>
          <div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> מצבי מצלמה</div>
          <div><kbd>Esc</kbd> שחרור העכבר</div>
        </div>
        <p style="margin-top:16px;font-size:12.5px">לחץ כדי להתחיל</p>
      </div>`;
    this.splash.onclick = () => {
      this.splash.hidden = true;
      onStart();
    };
    container.appendChild(this.splash);
  }

  showSplash(): void {
    this.splash.hidden = false;
  }

  setCrosshairActive(active: boolean): void {
    this.crosshair.classList.toggle('hit', active);
  }

  setCrosshairVisible(visible: boolean): void {
    this.crosshair.style.display = visible ? '' : 'none';
  }

  setInfo(content: InfoContent | null): void {
    if (!content) {
      this.info.hidden = true;
      return;
    }
    this.info.hidden = false;
    this.info.replaceChildren();
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = content.title;
    this.info.appendChild(title);
    if (content.meta) {
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = content.meta;
      this.info.appendChild(meta);
    }
    if (content.note) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = content.note;
      this.info.appendChild(note);
    }
  }

  setStatus(parts: string[]): void {
    this.status.replaceChildren();
    parts.forEach((part, i) => {
      if (i > 0) this.status.appendChild(document.createTextNode('·'));
      const span = document.createElement('span');
      const [head, ...rest] = part.split(': ');
      if (rest.length) {
        const strong = document.createElement('strong');
        strong.textContent = rest.join(': ');
        span.append(document.createTextNode(`${head}: `), strong);
      } else {
        span.textContent = part;
      }
      this.status.appendChild(span);
    });
  }
}
