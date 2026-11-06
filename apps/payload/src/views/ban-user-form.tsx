"use client";

import { Button } from "@payloadcms/ui";
import { type SubmitEvent, useState } from "react";

import {
  BAN_DURATIONS,
  type BanOutcome,
  type BanUserFields,
  confirmationOf,
  formOf,
  outcomeOf,
  UNREACHABLE_OUTCOME,
} from "./ban-user-model";

type Step =
  | { readonly name: "editing" }
  | { readonly name: "confirming" }
  | { readonly name: "sending" }
  | { readonly name: "done"; readonly outcome: BanOutcome };

const EMPTY: BanUserFields = { channelId: "", targetId: "", duration: "1440", reason: "" };

const send = async (fields: BanUserFields): Promise<BanOutcome> => {
  const form = formOf(fields);
  if (form === undefined) {
    return UNREACHABLE_OUTCOME;
  }
  const response = await fetch("/api/actions/ban-user", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(form),
  }).catch(() => undefined);
  if (response === undefined) {
    return UNREACHABLE_OUTCOME;
  }
  return outcomeOf(response.status, await response.json().catch(() => undefined));
};

export const BanUserForm = () => {
  const [fields, setFields] = useState<BanUserFields>(EMPTY);
  const [step, setStep] = useState<Step>({ name: "editing" });
  const editable = step.name === "editing" || step.name === "done";

  const change = (name: keyof BanUserFields) => (value: string) => {
    setFields({ ...fields, [name]: value });
    setStep({ name: "editing" });
  };

  const review = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStep({ name: "confirming" });
  };

  const confirm = async () => {
    setStep({ name: "sending" });
    setStep({ name: "done", outcome: await send(fields) });
  };

  return (
    <form className="ban-user" onSubmit={review}>
      <label className="ban-user__field">
        <span>Chaîne (identifiant)</span>
        <input
          required
          disabled={!editable}
          value={fields.channelId}
          onChange={(event) => change("channelId")(event.target.value)}
        />
      </label>
      <label className="ban-user__field">
        <span>Utilisateur à bannir (identifiant)</span>
        <input
          required
          disabled={!editable}
          value={fields.targetId}
          onChange={(event) => change("targetId")(event.target.value)}
        />
      </label>
      <label className="ban-user__field">
        <span>Durée</span>
        <select
          disabled={!editable}
          value={fields.duration}
          onChange={(event) => change("duration")(event.target.value)}
        >
          {BAN_DURATIONS.map((duration) => (
            <option key={duration.value} value={duration.value}>
              {duration.label}
            </option>
          ))}
        </select>
      </label>
      <label className="ban-user__field">
        <span>Motif</span>
        <textarea
          required
          maxLength={500}
          disabled={!editable}
          value={fields.reason}
          onChange={(event) => change("reason")(event.target.value)}
        />
      </label>
      {step.name === "confirming" || step.name === "sending" ? (
        <div className="ban-user__confirmation" role="alertdialog" aria-live="assertive">
          <p>{confirmationOf(fields)}</p>
          <Button
            buttonStyle="error"
            disabled={step.name === "sending"}
            onClick={() => void confirm()}
          >
            Confirmer le bannissement
          </Button>
          <Button
            buttonStyle="secondary"
            disabled={step.name === "sending"}
            onClick={() => setStep({ name: "editing" })}
          >
            Annuler
          </Button>
        </div>
      ) : (
        <Button type="submit">Bannir…</Button>
      )}
      {step.name === "done" ? (
        <p className={`ban-user__outcome ban-user__outcome--${step.outcome.kind}`} role="status">
          {step.outcome.message}
        </p>
      ) : null}
    </form>
  );
};
