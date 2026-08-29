export const SIDEBAR_LAYOUT = {
  WIDTH_CLASS: 'w-[280px]',
  /**
   * Collapsed width. The sidebar does not disappear when collapsed — it becomes
   * an icon rail, so the primary actions stay one click away instead of behind
   * a shortcut.
   *
   * Sized to its widest child rather than to a round number: the 44px logo and
   * New-thread square plus a 12px gutter either side. At 100px the squares hugged
   * the left edge and left ~60px of dead panel beside them, which read as a
   * half-drawn sidebar instead of a rail.
   */
  RAIL_WIDTH_CLASS: 'w-[68px]',
  DRAG_REGION_HEIGHT: 32,
  FULLSCREEN_SPACER_HEIGHT: 18,
  WINDOWED_SPACER_HEIGHT: 12,
}
