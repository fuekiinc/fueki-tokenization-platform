/**
 * TemplateBrowser -- grid layout that filters and displays TemplateCards.
 *
 * Reads the search query and selected category from the contract deployer
 * store, filters the template registry accordingly, and renders a responsive
 * 3-column grid. Shows an empty state when no templates match the current
 * filters.
 */

import { useMemo } from 'react';
import { FileCode2, SearchX } from 'lucide-react';
import { searchTemplates, TEMPLATES } from '../../contracts/templates';
import { useContractDeployerStore } from '../../store/contractDeployerStore';
import { EMPTY_STATE_CLASSES } from '../../lib/designTokens';
import { TemplateCard } from './TemplateCard';
import type { ContractTemplate } from '../../types/contractDeployer';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateBrowser() {
  const searchQuery = useContractDeployerStore((s) => s.searchQuery);
  const selectedCategory = useContractDeployerStore((s) => s.selectedCategory);

  const filteredTemplates: ContractTemplate[] = useMemo(() => {
    // Start with text-search filtered results (returns all if query is empty).
    let results = searchQuery.trim()
      ? searchTemplates(searchQuery)
      : TEMPLATES;

    // Apply category filter.
    if (selectedCategory !== 'all') {
      results = results.filter((t) => t.category === selectedCategory);
    }

    return results;
  }, [searchQuery, selectedCategory]);

  // ---- Empty state --------------------------------------------------------

  if (filteredTemplates.length === 0) {
    return (
      <div className={EMPTY_STATE_CLASSES.container}>
        <div className={EMPTY_STATE_CLASSES.iconBox}>
          <SearchX className={EMPTY_STATE_CLASSES.icon} />
        </div>
        <p className={EMPTY_STATE_CLASSES.title}>
          No templates match your search
        </p>
        <p className={EMPTY_STATE_CLASSES.description}>
          Try adjusting your search terms or selecting a different category to
          find the contract you need.
        </p>
      </div>
    );
  }

  // ---- Grid ---------------------------------------------------------------

  return (
    <div>
      {/* Result count */}
      <div className="mb-6 flex items-center gap-2">
        <FileCode2 className="h-4 w-4 text-gray-600" />
        <span className="text-xs font-medium text-gray-500">
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} available
        </span>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 sm:gap-6">
        {filteredTemplates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}

export default TemplateBrowser;
