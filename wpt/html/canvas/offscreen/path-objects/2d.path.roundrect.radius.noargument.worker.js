// DO NOT EDIT! This test has been generated by /html/canvas/tools/gentest.py.
// OffscreenCanvas test in a worker:2d.path.roundrect.radius.noargument
// Description:Check that roundRect draws a rectangle when no radii are provided.
// Note:

importScripts("/resources/testharness.js");
importScripts("/html/canvas/resources/canvas-tests.js");

var t = async_test("Check that roundRect draws a rectangle when no radii are provided.");
var t_pass = t.done.bind(t);
var t_fail = t.step_func(function(reason) {
    throw reason;
});
t.step(function() {

  var canvas = new OffscreenCanvas(100, 50);
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f00';
  ctx.fillRect(0, 0, 100, 50);
  ctx.roundRect(10, 10, 80, 30);
  ctx.fillStyle = '#0f0';
  ctx.fill();
  // upper left corner (10, 10)
  _assertPixel(canvas, 10,9, 255,0,0,255);
  _assertPixel(canvas, 9,10, 255,0,0,255);
  _assertPixel(canvas, 10,10, 0,255,0,255);

  // upper right corner (89, 10)
  _assertPixel(canvas, 90,10, 255,0,0,255);
  _assertPixel(canvas, 89,9, 255,0,0,255);
  _assertPixel(canvas, 89,10, 0,255,0,255);

  // lower right corner (89, 39)
  _assertPixel(canvas, 89,40, 255,0,0,255);
  _assertPixel(canvas, 90,39, 255,0,0,255);
  _assertPixel(canvas, 89,39, 0,255,0,255);

  // lower left corner (10, 30)
  _assertPixel(canvas, 9,39, 255,0,0,255);
  _assertPixel(canvas, 10,40, 255,0,0,255);
  _assertPixel(canvas, 10,39, 0,255,0,255);
  t.done();
});
done();
