// META: title=postMessage(): target port and source port

    var TARGET = null;
    var SOURCE = null;
    var description = "The postMessage() method - Let target port be the port with which source "
                    + "port is entangled, if any.";

    var t = async_test("Test Description: " + description);

    var channel = new MessageChannel();
    SOURCE = channel.port1;
    TARGET = channel.port2;
    TARGET.start();
    TARGET.addEventListener("message", t.step_func(TestMessageEvent), true);

    SOURCE.postMessage("ping");

    function TestMessageEvent(evt)
    {
        assert_equals(evt.target, TARGET);
        assert_not_equals(evt.target, SOURCE);
        t.done();
    }
