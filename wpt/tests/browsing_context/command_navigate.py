import pytest


@pytest.mark.asyncio
async def test_browsing_context_navigate_wait_none(bidi_session, wait_for_event,
      context_id):
    await bidi_session.session.subscribe(
        events=["browsingContext.domContentLoaded", "browsingContext.load"])

    page_with_an_image_url = "data:text/html,<img src='data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAAUA AAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO 9TXL0Y4OHwAAAABJRU5ErkJggg=='>"

    create_command_future = await bidi_session.send_command(
        "browsingContext.navigate", {
            "url": page_with_an_image_url,
            "wait": "none",
            "context": context_id})

    load_event_future = wait_for_event("browsingContext.load")
    dom_content_loaded_event_future = wait_for_event(
        "browsingContext.domContentLoaded")

    assert create_command_future.done() is False
    assert load_event_future.done() is False
    assert dom_content_loaded_event_future.done() is False

    create_command_result = await create_command_future
    navigation_id = create_command_result["navigation"]
    assert create_command_result == {
        "navigation": navigation_id,
        "url": page_with_an_image_url}

    # Verify event order.
    assert load_event_future.done() is False
    assert dom_content_loaded_event_future.done() is False

    dom_content_loaded_event = await dom_content_loaded_event_future
    assert dom_content_loaded_event == {
        "context": context_id,
        "navigation": navigation_id}

    # Verify event was not yet emitted.
    assert load_event_future.done() is False

    # Wait for `browsingContext.load` event.
    load_event = await load_event_future
    assert load_event == {
        "context": context_id,
        "navigation": navigation_id}
