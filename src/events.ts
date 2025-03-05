export class TypedEventTarget<T extends TypedEvent<string>[]> {
  constructor(private target: EventTarget = new EventTarget()) {}

  public addEventListener<K extends T[number]["type"]>(
    type: K,
    listener: (event: T[number] & { type: K }) => void,
    options?: AddEventListenerOptions | boolean,
  ): void {
    this.target.addEventListener(
      type as string,
      listener as EventListener,
      options,
    )
  }

  public removeEventListener<K extends T[number]["type"]>(
    type: K,
    listener: (event: T[number] & { type: K }) => void,
    options?: EventListenerOptions | boolean,
  ): void {
    this.target.removeEventListener(
      type as string,
      listener as EventListener,
      options,
    )
  }

  public on<K extends T[number]["type"]>(
    type: K,
    listener: (event: T[number] & { type: K }) => void,
    options?: AddEventListenerOptions | boolean,
  ): void {
    this.addEventListener(type, listener, options)
  }

  public off<K extends T[number]["type"]>(
    type: K,
    listener: (event: T[number] & { type: K }) => void,
    options?: EventListenerOptions | boolean,
  ): void {
    this.removeEventListener(type, listener, options)
  }

  dispatchEvent(event: T[number]): boolean {
    return this.target.dispatchEvent(event)
  }

  protected emit<K extends T[number]["type"]>(
    type: K,
    detail?: (T[number] & { type: K })["detail"],
  ): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail }))
  }
}

export type TypedEvent<
  Type extends string,
  Detail = unknown,
> = CustomEvent<Detail> & { readonly type: Type }
