const contexts = [
  "identity",
  "channel",
  "stream",
  "chat",
  "moderation",
  "discovery",
  "monetization",
  "notification",
];
const surfaces = [
  "ios",
  "api",
  "payload",
  "web",
  "ui",
  "tokens",
  "adr",
  "infra",
  "ci",
  "deps",
  "tooling",
];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", [...contexts, ...surfaces]],
    "subject-case": [0],
  },
};
