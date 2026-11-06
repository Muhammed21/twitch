import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";

import { BanUserForm } from "./ban-user-form";

export const BanUserView = ({ initPageResult, params, searchParams }: AdminViewServerProps) => {
  const { req, locale, permissions, visibleEntities } = initPageResult;
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <Gutter>
        <h1>Bannir un utilisateur d'une chaîne</h1>
        <p>
          L'action passe par l'API, à votre nom : vos droits de modération sur la chaîne
          s'appliquent, et rien n'est enregistré dans Payload.
        </p>
        {req.user === null ? <p>Connectez-vous pour bannir.</p> : <BanUserForm />}
      </Gutter>
    </DefaultTemplate>
  );
};
