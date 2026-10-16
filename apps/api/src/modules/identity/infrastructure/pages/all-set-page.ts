import { markup } from "./html.ts";
import {
  ALL_SET_ILLUSTRATION_PATH,
  hiddenFields,
  renderDocument,
  SIGNUP_CONTINUE_PATH,
} from "./page-layout.ts";

export const renderAllSetPage = ({
  oauthQuery,
  csrf,
}: {
  oauthQuery: string;
  csrf: string;
}): string =>
  renderDocument({
    title: "Account Verification",
    body: markup`<main class="top">
        <form method="post" action="${SIGNUP_CONTINUE_PATH}">
          <h1 class="title">Account Verification</h1>
          <div class="all-set">
            <img src="${ALL_SET_ILLUSTRATION_PATH}" width="135" height="134" alt="" />
            <h2 class="heading">You're All Set!</h2>
            <p>Thanks for helping keep Twitch safe and fun for everybody!</p>
          </div>
          ${hiddenFields({ csrf, oauthQuery })}
          <button class="action trailing" type="submit">Done</button>
        </form>
      </main>`,
  });
