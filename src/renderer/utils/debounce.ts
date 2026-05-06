export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  ms: number,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
