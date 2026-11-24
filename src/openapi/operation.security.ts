import { getActionMeta } from '../core/action.decorator';
import { getBeforeHookSecurity } from '../core/before.decorator';
import { ActionClass } from './schema';

export function operationSecurity(actionClass: ActionClass) {
  const action = new actionClass();
  const actionMeta = getActionMeta(actionClass);

  if (actionMeta.openapi?.security) {
    return actionMeta.openapi.security;
  }

  return getBeforeHookSecurity(action);
}
