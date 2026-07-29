export function formatNumber(value: number): string {
    return Math.round(value).toLocaleString('en-US');
  }
  
  export function formatWon(value: number): string {
    return `₩${formatNumber(value)}`;
  }
  
  export function formatSignedWon(value: number): string {
    const rounded = Math.round(value);
    const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
    return `${sign}₩${Math.abs(rounded).toLocaleString('en-US')}`;
  }
  
  export function formatCompact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return formatNumber(value);
  }
  