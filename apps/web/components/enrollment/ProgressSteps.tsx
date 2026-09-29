export const ENROLLMENT_STEPS = ["Personal details", "Health info", "Documents", "Review", "Submit"] as const;

interface ProgressStepsProps {
  current: number; // 1-based
  // Only earlier steps are clickable: moving forward always goes through the
  // current step's Continue button, which is where edits get saved.
  onSelect: (step: number) => void;
}

export function ProgressSteps({ current, onSelect }: ProgressStepsProps) {
  return (
    <nav aria-label="Enrollment progress">
      <ol className="flex gap-2">
        {ENROLLMENT_STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li key={label} className="flex-1">
              <button
                type="button"
                disabled={!done}
                onClick={() => onSelect(step)}
                aria-current={active ? "step" : undefined}
                className="w-full text-left disabled:cursor-default"
              >
                <span
                  className={`block h-1.5 rounded-full ${active || done ? "bg-gray-900" : "bg-gray-200"}`}
                />
                <span className={`mt-2 block text-xs ${active ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                  <span className="tabular-nums">{step}.</span> {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
