// DO NOT EDIT! This test has been generated by /html/canvas/tools/gentest.py.
// OffscreenCanvas test in a worker:2d.path.roundrect.4.radii.4.dompointinit
// Description:Verify that when four radii are given to roundRect(), the fourth radius, specified as a DOMPointInit, applies to the bottom-left corner.
// Note:

importScripts("/resources/testharness.js");
importScripts("/html/canvas/resources/canvas-tests.js");

var t = async_test("Verify that when four radii are given to roundRect(), the fourth radius, specified as a DOMPointInit, applies to the bottom-left corner.");
var t_pass = t.done.bind(t);
var t_fail = t.step_func(function(reason) {
    throw reason;
});
t.step(function() {

  var canvas = new OffscreenCanvas(100, 50);
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f00';
  ctx.fillRect(0, 0, 100, 50);
  ctx.roundRect(0, 0, 100, 50, [0, 0, 0, {x: 40, y: 20}]);
  ctx.fillStyle = '#0f0';
  ctx.fill();

  // bottom-left corner
  _assertPixel(canvas, 20,48, 255,0,0,255);
  _assertPixel(canvas, 41,48, 0,255,0,255);
  _assertPixel(canvas, 1,39, 255,0,0,255);
  _assertPixel(canvas, 1,28, 0,255,0,255);

  // other corners
  _assertPixel(canvas, 1,1, 0,255,0,255);
  _assertPixel(canvas, 98,1, 0,255,0,255);
  _assertPixel(canvas, 98,48, 0,255,0,255);
  t.done();
});
done();
