/**
 * Scrollable output viewer component (overlay)
 * Reuses the same ctx.ui.custom({ overlay: true }) pattern as the swarm dashboard.
 */

import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export class OutputViewerComponent {
  private lines: string[];
  private title: string;
  private scrollY = 0;
  onClose?: () => void;

  constructor(title: string, output: string) {
    this.title = title;
    this.lines = output.split("\n");
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || data === "q" || data === "Q") {
      this.onClose?.();
      return;
    }
    if (matchesKey(data, "up")) {
      this.scrollY = Math.max(0, this.scrollY - 1);
    } else if (matchesKey(data, "down")) {
      this.scrollY++;
    } else if (matchesKey(data, "home")) {
      this.scrollY = 0;
    } else if (matchesKey(data, "end")) {
      this.scrollY = Math.max(0, this.lines.length - 10);
    }
  }

  render(width: number): string[] {
    const w = Math.max(width, 40);
    const outputAreaHeight = Math.max(10, 30);
    const maxScroll = Math.max(0, this.lines.length - outputAreaHeight);
    if (this.scrollY > maxScroll) this.scrollY = maxScroll;

    const border = (s: string) => `\x1b[2m${s}\x1b[0m`;
    const accent = (s: string) => `\x1b[36m${s}\x1b[0m`;
    const dim = (s: string) => `\x1b[90m${s}\x1b[0m`;
    const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;

    const bLine = (content: string) => {
      const cw = visibleWidth(content);
      const pad = Math.max(0, w - cw - 2);
      return `${border("│")}${content}${" ".repeat(pad)}${border("│")}`;
    };

    const out: string[] = [];

    // Header
    out.push(border(`╭${"─".repeat(w - 2)}╮`));
    out.push(bLine(` ${accent(bold(`📋 ${this.title}`))} ${dim(`│ ${this.lines.length} lines`)}`));
    out.push(border(`├${"─".repeat(w - 2)}┤`));

    // Scroll info
    const scrollLabel = this.lines.length > outputAreaHeight
      ? dim(`[${this.scrollY + 1}-${Math.min(this.scrollY + outputAreaHeight, this.lines.length)} of ${this.lines.length} │ ↑↓ scroll │ Home/End]`)
      : "";
    if (scrollLabel) {
      out.push(bLine(` ${scrollLabel}`));
      out.push(border(`│${"─".repeat(w - 2)}│`));
    }

    // Output lines
    const visible = this.lines.slice(this.scrollY, this.scrollY + outputAreaHeight);
    for (let i = 0; i < outputAreaHeight; i++) {
      const line = visible[i] ?? "";
      out.push(bLine(` ${truncateToWidth(line, w - 4)}`));
    }

    // Footer
    out.push(border(`├${"─".repeat(w - 2)}┤`));
    out.push(bLine(` ${dim("↑↓ scroll │ Home/End jump │ q/esc close")}`));
    out.push(border(`╰${"─".repeat(w - 2)}╯`));

    return out;
  }

  invalidate(): void {}
}
