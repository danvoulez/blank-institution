import { buildEveToolMap } from "@github-tools/sdk/eve";
import { getToken, UserAuthorizationRequiredError } from "@vercel/connect";
import { defineDynamic } from "eve/tools";
import { CONNECT_USER_ISSUER, GITHUB_CONNECTOR } from "../../shared/connect.js";

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const auth = ctx.session.auth.current;
      const role = auth?.attributes && typeof auth.attributes === "object" ? auth.attributes.role : undefined;
      if (role === "supervisor" || role === "metabolism") return {};
      const attributedUserId = auth?.attributes && typeof auth.attributes === "object" ? auth.attributes.userId : undefined;
      const userId = typeof attributedUserId === "string" ? attributedUserId : auth?.principalId;
      if (!userId || userId.startsWith("eve:") || userId.startsWith("institution:") && typeof attributedUserId !== "string") {
        return {};
      }

      try {
        const token = await getToken(GITHUB_CONNECTOR, {
          subject: {
            type: "user",
            id: userId,
            issuer: auth.issuer ?? auth.authenticator ?? CONNECT_USER_ISSUER,
          },
          scopes: ["repo"],
        });
        return buildEveToolMap({ preset: "maintainer", token });
      }
      catch (error) {
        if (error instanceof UserAuthorizationRequiredError) {
          return {};
        }
        throw error;
      }
    },
  },
});
