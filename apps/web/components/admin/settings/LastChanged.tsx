import type { SettingsSectionMeta } from "@insurance/shared";
import { formatDateTime } from "../../../lib/format";

export function LastChanged({ meta }: { meta: SettingsSectionMeta }) {
  return (
    <p className="text-xs text-gray-500">
      {meta.updatedAt ? (
        <>
          Last changed {formatDateTime(meta.updatedAt)}
          {meta.updatedBy && (
            <>
              {" "}by <span className="font-medium text-gray-700">{meta.updatedBy}</span>
            </>
          )}
        </>
      ) : (
        "Using the defaults · never changed"
      )}
    </p>
  );
}
