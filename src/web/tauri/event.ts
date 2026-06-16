export type UnlistenFn = () => void

export async function listen<T>(
  _event: string,
  _handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  return () => {}
}

export async function emit<T>(_event: string, _payload?: T): Promise<void> {}
