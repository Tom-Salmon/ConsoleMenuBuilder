import type { Clash } from '../analysis/clashes';

/**
 * לוח "בדיקת תכנון".
 *
 * הממצאים מוצגים לפי חומרה. לחיצה על שורה מטיסה את המצלמה למקום ומדגישה את
 * הממצא בסצנה. ממצא שנשען על הריהוט מסומן במפורש כהצעה לבדיקה, כי לפי הערת
 * המתכנן הריהוט הוא להמחשה בלבד ואינו מידה מחייבת.
 */

const SEVERITY_HE: Record<Clash['severity'], string> = {
  error: 'שגיאה',
  warning: 'אזהרה',
  note: 'הערה',
};

export class ClashPanel {
  readonly root = document.createElement('aside');
  private readonly list = document.createElement('div');

  constructor(
    private readonly onSelect: (clash: Clash) => void,
    private readonly onExport: () => void,
  ) {
    this.root.className = 'clash-panel';
    this.root.hidden = true;

    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'בדיקת תכנון';
    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'ייצוא JSON';
    exportBtn.onclick = () => this.onExport();
    const close = document.createElement('button');
    close.textContent = '✕';
    close.onclick = () => this.toggle(false);
    header.append(title, exportBtn, close);

    this.list.className = 'clash-list';

    const footer = document.createElement('div');
    footer.className = 'clash-footer';
    footer.textContent =
      'ממצא שמסומן "מערב ריהוט" הוא הצעה לבדיקה בלבד: לפי הערת המתכנן, ' +
      'סימון הריהוט והכלים הסניטריים בתכנית הוא להמחשה בלבד. ' +
      'ממצאים שמערבים רק אדריכלות ומערכות הם בעלי משקל גבוה יותר.';

    this.root.append(header, this.list, footer);
    document.getElementById('app')!.appendChild(this.root);
  }

  render(clashes: Clash[]): void {
    this.list.replaceChildren();
    if (clashes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'clash-footer';
      empty.textContent = 'לא נמצאו התנגשויות.';
      this.list.appendChild(empty);
      return;
    }
    for (const clash of clashes) {
      const button = document.createElement('button');
      button.className = `clash ${clash.severity}`;
      button.onclick = () => this.onSelect(clash);

      const head = document.createElement('div');
      head.className = 'head';
      const dot = document.createElement('span');
      dot.className = 'dot';
      head.append(dot, document.createTextNode(`${clash.title_he}`));
      const sev = document.createElement('span');
      sev.className = 'count';
      sev.style.marginInlineStart = 'auto';
      sev.textContent = `${SEVERITY_HE[clash.severity]} · כלל ${clash.rule}`;
      head.appendChild(sev);

      const detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = clash.detail_he;

      button.append(head, detail);
      if (clash.involvesFurniture) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'מערב ריהוט — להמחשה בלבד';
        button.appendChild(tag);
      }
      this.list.appendChild(button);
    }
  }

  toggle(force?: boolean): boolean {
    this.root.hidden = force !== undefined ? !force : !this.root.hidden;
    return !this.root.hidden;
  }
}
