import {
  devtools,
  type NamedSet,
  subscribeWithSelector,
} from 'zustand/middleware';
import type {
  StateCreator,
  StoreMutatorIdentifier,
} from 'zustand/vanilla';

type StoreMutators = [StoreMutatorIdentifier, unknown][];
type StoreAction = (...args: unknown[]) => unknown;
type SelectorMutator = ['zustand/subscribeWithSelector', never];
type DevtoolsMutator = ['zustand/devtools', never];

function withNamedStoreActions<
  T,
  Mos extends StoreMutators = [],
>(
  storeName: string,
  initializer: StateCreator<T, [], Mos>,
): StateCreator<T, [], Mos> {
  return ((set, get, api) => {
    let currentActionName = `${storeName}/setState`;

    const namedSet = ((
      partial: Parameters<typeof set>[0],
      replace?: Parameters<typeof set>[1],
    ) =>
      (set as unknown as NamedSet<T>)(
        partial as Parameters<NamedSet<T>>[0],
        replace as Parameters<NamedSet<T>>[1],
        currentActionName,
      )) as typeof set;

    const storeState = initializer(namedSet, get, api);

    if (!storeState || typeof storeState !== 'object') {
      return storeState;
    }

    const wrappedEntries = Object.entries(storeState as Record<string, unknown>).map(([key, value]) => {
      if (typeof value !== 'function') {
        return [key, value];
      }

      const action = value as StoreAction;
      return [
        key,
        (...args: unknown[]) => {
          const previousActionName = currentActionName;
          currentActionName = `${storeName}/${key}`;

          try {
            return action(...args);
          } finally {
            currentActionName = previousActionName;
          }
        },
      ];
    });

    return Object.fromEntries(wrappedEntries) as unknown as T;
  }) as StateCreator<T, [], Mos>;
}

export function withStoreMiddleware<
  T,
  Mos extends StoreMutators = [],
>(
  storeName: string,
  initializer: StateCreator<T, [], Mos>,
): StateCreator<T, [], [DevtoolsMutator, SelectorMutator, ...Mos]> {
  const withSelectors = subscribeWithSelector(withNamedStoreActions(storeName, initializer));

  if (import.meta.env.DEV) {
    return devtools(withSelectors, {
      name: storeName,
      anonymousActionType: `${storeName}/setState`,
      enabled: true,
    }) as unknown as StateCreator<T, [], [DevtoolsMutator, SelectorMutator, ...Mos]>;
  }

  return withSelectors as unknown as StateCreator<T, [], [DevtoolsMutator, SelectorMutator, ...Mos]>;
}
