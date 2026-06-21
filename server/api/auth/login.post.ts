import type { LoginRequestBody, LoginResponse } from "~~/shared/types/auth";
import { authenticateLogin } from "../../utils/auth";
import { recordAuthLocationEvent } from "../../utils/auth-locations";

export default eventHandler(async (event): Promise<LoginResponse> => {
  const body = await readBody<Partial<LoginRequestBody>>(event);
  const result = await authenticateLogin(body);

  await recordAuthLocationEvent({
    event,
    source: result.source,
    userId: result.user.id,
    role: result.user.role,
    eventType: "login",
    location: body?.location,
  });

  return {
    user: result.user,
    token: result.token,
  };
});
