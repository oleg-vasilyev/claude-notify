import { readConfig } from "#state/config.ts";
import { log } from "#state/log.ts";
import { boundPort, startRelay } from "#relay/relay-server.ts";


const NOT_A_RELAY_HOST = 1;

const refuse: (reason: string) => never = (reason) => {
  console.error(`claude-notify relay: ${reason}`);

  return process.exit(NOT_A_RELAY_HOST);
};

const config = readConfig() ?? refuse("no settings yet — run npm run setup first");
const delivery = config.delivery;

if (delivery.kind !== "telegram") {
  refuse("a relay host needs a BOT_TOKEN and a CHAT_ID of its own — this machine sends through a relay itself");
}

if (config.relaySecret === "") {
  refuse("RELAY_SECRET is empty, and a relay without one would forward whatever anybody sends it");
}

const server = await startRelay({
  port: config.relayPort,
  secret: config.relaySecret,
  token: delivery.token,
  chatId: delivery.chatId,
});

log(`RELAY listening on ${boundPort(server)}`);
console.log(`relay listening on ${boundPort(server)}`);
