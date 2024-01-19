// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck Some types may be circular.

import z from 'zod';

export const PermissionsCommandSchema = z.lazy(
  () => Permissions.SetPermissionSchema
);
export namespace Permissions {
  export const PermissionDescriptorSchema = z.lazy(() =>
    z.object({
      name: z.string(),
    })
  );
}
export namespace Permissions {
  export const PermissionStateSchema = z.lazy(() =>
    z.enum(['granted', 'denied', 'prompt'])
  );
}
export namespace Permissions {
  export const SetPermissionSchema = z.lazy(() =>
    z.object({
      method: z.literal('permissions.setPermission'),
      params: Permissions.SetPermissionParametersSchema,
    })
  );
}
export namespace Permissions {
  export const SetPermissionParametersSchema = z.lazy(() =>
    z.object({
      descriptor: Permissions.PermissionDescriptorSchema,
      state: Permissions.PermissionStateSchema,
      origin: z.string(),
    })
  );
}
