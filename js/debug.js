/* Auto Rally – developer stats panel (toggle with the ` key or ?debug=1). */
(function (AR) {
  'use strict';

  function drawOverlay(ctx, view, stats) {
    var lines = [
      'FPS ' + stats.fps + ' · updates/s ' + stats.ups,
      'View ' + view.w + '×' + view.h + ' · canvas ' + view.pxW + '×' + view.pxH + ' (×' + view.scale.toFixed(2) + ')'
    ];
    if (AR.game && AR.game.info) {
      var i = AR.game.info();
      lines.push('Seg ' + i.segment + '/' + i.segments + ' · ' + i.zone + ' · curve ' + i.curve.toFixed(1) + ' · height ' + i.height);
      lines.push('Auto x ' + i.x.toFixed(2) + ' · ' + i.surface + ' · speed ' + Math.round(i.speed) + ' · quality ' + i.quality);
      var s = AR.input.state;
      lines.push('Input L' + (+s.left) + ' R' + (+s.right) + ' U' + (+s.up) + ' D' + (+s.down) +
        ' · touch ' + (AR.input.isTouchMode() ? 'on' : 'off') + ' · auto-gas ' + (AR.input.isGasActive() ? 'on' : 'off'));
      lines.push('State ' + i.state + ' · lap ' + i.lap + ' · checkpoint ' + (i.halfway ? 'passed' : 'not yet'));
    }
    var lh = 15, pad = 7;
    ctx.font = '11px ui-monospace, Consolas, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var tw = 0;
    for (var k = 0; k < lines.length; k++) tw = Math.max(tw, ctx.measureText(lines[k]).width);
    var top = 150;                                  // below the HUD
    ctx.fillStyle = 'rgba(27, 31, 59, 0.75)';
    ctx.fillRect(8, top, Math.min(tw + pad * 2, view.w - 16), lines.length * lh + pad * 2 - 3);
    ctx.fillStyle = '#ffffff';
    for (k = 0; k < lines.length; k++) ctx.fillText(lines[k], 8 + pad, top + pad + k * lh);
  }

  AR.debug = { drawOverlay: drawOverlay };
})(window.AutoRally = window.AutoRally || {});
