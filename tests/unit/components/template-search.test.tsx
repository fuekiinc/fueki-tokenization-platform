import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplateSearch } from '../../../src/components/ContractDeployer/TemplateSearch';

describe('TemplateSearch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces search query updates before invoking onSearchChange', () => {
    vi.useFakeTimers();
    const onSearchChange = vi.fn();
    const onCategoryChange = vi.fn();

    render(
      <TemplateSearch
        searchQuery=""
        onSearchChange={onSearchChange}
        selectedCategory="all"
        onCategoryChange={onCategoryChange}
      />,
    );

    fireEvent.change(
      screen.getByRole('textbox', { name: /search contract templates/i }),
      { target: { value: 'escrow' } },
    );

    expect(onSearchChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('escrow');
  });

  it('lets users clear the search and switch categories', () => {
    const onSearchChange = vi.fn();
    const onCategoryChange = vi.fn();

    render(
      <TemplateSearch
        searchQuery="token"
        onSearchChange={onSearchChange}
        selectedCategory="all"
        onCategoryChange={onCategoryChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(onSearchChange).toHaveBeenCalledWith('');

    fireEvent.click(screen.getByRole('tab', { name: 'NFTs' }));
    expect(onCategoryChange).toHaveBeenCalledWith('nfts');
  });
});
