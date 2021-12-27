class Session:
    def __init__(self, send_blocking_command):
        self._send_blocking_command = send_blocking_command

    async def subscribe(self, events):
        await self._send_blocking_command("session.subscribe",
                                          {"events": events})
