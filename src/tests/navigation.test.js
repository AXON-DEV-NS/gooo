import { describe, expect, it } from 'vitest';
import {
  findNextSpatialElement,
  isRemoteBackEvent,
  isRemoteConfirmEvent,
} from '../app/navigation.js';

function makeMockBox(id, left, top, width = 100, height = 40) {
  return {
    id,
    getBoundingClientRect: () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    }),
  };
}

describe('TV remote navigation', () => {
  it('detects standard and Smart TV vendor Back & Confirm key events', () => {
    expect(isRemoteBackEvent({ key: 'Escape' })).toBe(true);
    expect(isRemoteBackEvent({ key: 'BrowserBack' })).toBe(true);
    expect(isRemoteBackEvent({ key: 'Unidentified', keyCode: 461 })).toBe(true);
    expect(isRemoteBackEvent({ key: 'Unidentified', keyCode: 10009 })).toBe(true);
    expect(isRemoteBackEvent({ key: 'ArrowLeft', keyCode: 37 })).toBe(false);

    expect(isRemoteConfirmEvent({ key: 'Enter' })).toBe(true);
    expect(isRemoteConfirmEvent({ key: 'Select', keyCode: 23 })).toBe(true);
  });

  it('selects nearest element in requested D-pad direction', () => {
    const rightBtn = makeMockBox('right', 600, 100);
    const leftBtn = makeMockBox('left', 300, 100);
    const downBtn = makeMockBox('down', 600, 260);
    const all = [rightBtn, leftBtn, downBtn];

    expect(findNextSpatialElement(rightBtn, all, 'ArrowLeft')?.id).toBe('left');
    expect(findNextSpatialElement(leftBtn, all, 'ArrowRight')?.id).toBe('right');
    expect(findNextSpatialElement(rightBtn, all, 'ArrowDown')?.id).toBe('down');
    expect(findNextSpatialElement(downBtn, all, 'ArrowUp')?.id).toBe('right');
  });
});
