import { describe, expect, it } from "vitest";

import { markup, raw } from "./html.ts";

describe("gabarit HTML échappé (ADR 0039)", () => {
  it("échappe chaque valeur insérée", () => {
    const value = `<script>alert("x")</script> & 'y'`;

    expect(markup`<p>${value}</p>`.toString()).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;</p>",
    );
  });

  it("échappe une valeur placée dans un attribut", () => {
    expect(markup`<input value="${`" onfocus="x`}">`.toString()).toBe(
      '<input value="&quot; onfocus=&quot;x">',
    );
  });

  it("n'échappe pas deux fois un fragment déjà rendu", () => {
    const inner = markup`<b>${"<i>"}</b>`;

    expect(markup`<p>${inner}</p>`.toString()).toBe("<p><b>&lt;i&gt;</b></p>");
  });

  it("insère une liste de fragments à la suite", () => {
    const items = ["a<", "b>"].map((item) => markup`<li>${item}</li>`);

    expect(markup`<ul>${items}</ul>`.toString()).toBe("<ul><li>a&lt;</li><li>b&gt;</li></ul>");
  });

  it("n'écrit rien pour une valeur absente ou fausse", () => {
    expect(markup`<p>${undefined}${null}${false}</p>`.toString()).toBe("<p></p>");
  });

  it("laisse passer tel quel un texte marqué sûr", () => {
    expect(markup`<style>${raw(":root { --x: 1; }")}</style>`.toString()).toBe(
      "<style>:root { --x: 1; }</style>",
    );
  });

  it("écrit un nombre", () => {
    expect(markup`<p>${42}</p>`.toString()).toBe("<p>42</p>");
  });
});
