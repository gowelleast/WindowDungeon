import { CONFIG } from './config.js';

export function drawRoom(ctx, roomData) {
  // 배경 바닥
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, CONFIG.ROOM_OUTER_W, CONFIG.ROOM_OUTER_H);

  // 벽 (테두리)
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 20;
  ctx.strokeRect(0, 0, CONFIG.ROOM_OUTER_W, CONFIG.ROOM_OUTER_H);
  
  // 문(Doors) 렌더링
  if (roomData && roomData.doors) {
    ctx.fillStyle = '#000'; // 열린 공간 (검정)
    const doorWidth = 80;
    const cx = CONFIG.ROOM_OUTER_W / 2;
    const cy = CONFIG.ROOM_OUTER_H / 2;
    const thickness = 22; // 벽 두께보다 살짝 크게

    roomData.doors.forEach(dir => {
      if (dir === 'up') ctx.fillRect(cx - doorWidth/2, 0, doorWidth, thickness);
      if (dir === 'down') ctx.fillRect(cx - doorWidth/2, CONFIG.ROOM_OUTER_H - thickness, doorWidth, thickness);
      if (dir === 'left') ctx.fillRect(0, cy - doorWidth/2, thickness, doorWidth);
      if (dir === 'right') ctx.fillRect(CONFIG.ROOM_OUTER_W - thickness, cy - doorWidth/2, thickness, doorWidth);
    });
  }
}

export function drawPlayer(ctx, playerState) {
  const { lx, ly, facing } = playerState;
  const radius = 15;

  ctx.fillStyle = '#4caf50';
  ctx.beginPath();
  ctx.arc(lx, ly, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  
  const lineLen = 25;
  let dx = 0, dy = 0;
  if (facing === 'up') dy = -lineLen;
  if (facing === 'down') dy = lineLen;
  if (facing === 'left') dx = -lineLen;
  if (facing === 'right') dx = lineLen;
  
  ctx.lineTo(lx + dx, ly + dy);
  ctx.stroke();
}

export function drawPrompt(ctx, promptData) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(CONFIG.ROOM_OUTER_W/2 - 120, CONFIG.ROOM_OUTER_H/2 - 40, 240, 80);
  
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('[Space] 키를 눌러 문 열기', CONFIG.ROOM_OUTER_W/2, CONFIG.ROOM_OUTER_H/2 + 5);
  
  if (promptData.willOpenNew) {
    ctx.fillStyle = '#aaa';
    ctx.font = '12px sans-serif';
    ctx.fillText('(새로운 방을 발견합니다)', CONFIG.ROOM_OUTER_W/2, CONFIG.ROOM_OUTER_H/2 + 25);
  } else {
    ctx.fillStyle = '#8bc34a';
    ctx.font = '12px sans-serif';
    ctx.fillText('(이미 열려있는 방으로 포커스 이동)', CONFIG.ROOM_OUTER_W/2, CONFIG.ROOM_OUTER_H/2 + 25);
  }
}
