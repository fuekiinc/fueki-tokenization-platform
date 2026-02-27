/**
 * ConstructorForm -- dynamic form that renders typed input fields for each
 * constructor parameter defined in a ContractTemplate.
 *
 * This component does not manage state itself; it receives the current values,
 * errors, and an onChange callback from its parent (the deploy wizard page).
 * Field rendering is delegated to `renderField` from FieldRenderers.tsx which
 * maps each `SolidityType` to the correct specialised input component.
 */

import { Info } from 'lucide-react';

import type { ContractTemplate } from '../../types/contractDeployer';
import { renderField } from './FieldRenderers';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConstructorFormProps {
  /** The selected contract template whose constructor params drive the form. */
  template: ContractTemplate;
  /** Current values keyed by parameter name. */
  values: Record<string, string>;
  /** Validation errors keyed by parameter name. */
  errors: Record<string, string>;
  /** Called when any field value changes. */
  onChange: (name: string, value: string) => void;
  /** Disables all fields (e.g. while a deployment transaction is in-flight). */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConstructorForm({
  template,
  values,
  errors,
  onChange,
  disabled,
}: ConstructorFormProps) {
  const params = template.constructorParams;

  return (
    <div className="space-y-6">
      {/* Template description */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">
          Configure Parameters
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          {template.description}
        </p>
      </div>

      {/* No-params message */}
      {params.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-5 py-4">
          <Info
            className="h-5 w-5 text-gray-500 shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm text-gray-400">
            This contract requires no configuration parameters.
          </p>
        </div>
      )}

      {/* Dynamic fields */}
      {params.length > 0 && (
        <div className="space-y-5">
          {params.map((param) =>
            renderField(
              param,
              values[param.name] ?? '',
              errors[param.name],
              (val) => onChange(param.name, val),
              disabled,
            ),
          )}
        </div>
      )}
    </div>
  );
}
