// clients array was removed from mockData — weight data is now empty until connected to real DB
const clients: any[] = [];




export interface MonthlyWeighIn {
  clientId: string;
  clientName: string;
  franchise: string;
  avatar: string;
  month: string; // 'YYYY-MM'
  weight: number;
  trainer: string;
}

export interface MonthlyWeightChange {
  clientId: string;
  clientName: string;
  franchise: string;
  avatar: string;
  trainer: string;
  previousWeight: number;
  currentWeight: number;
  change: number; // negative = loss, positive = gain
}

export interface YearlyWeightChange {
  clientId: string;
  clientName: string;
  franchise: string;
  avatar: string;
  trainer: string;
  startWeight: number;
  currentWeight: number;
  totalChange: number; // negative = loss
  percentChange: number;
}

// Seed-based pseudo-random for consistent data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Generate monthly weight history for all clients
function generateWeightHistory(): MonthlyWeighIn[] {
  const allWeighIns: MonthlyWeighIn[] = [];
  const months = [
    '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10',
    '2025-11', '2025-12', '2026-01', '2026-02',
  ];

  clients.forEach((client, idx) => {
    const rand = seededRandom(idx * 137 + 42);
    const startW = client.startWeight;
    const currentW = client.weight;
    const totalChange = currentW - startW;

    // Determine join month index (some clients joined later)
    const joinDate = new Date(client.joinDate);
    const joinMonthStr = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}`;
    let startMonthIdx = months.indexOf(joinMonthStr);
    if (startMonthIdx < 0) startMonthIdx = 0;

    // Generate progressive weights from startWeight to currentWeight
    const activeMonths = months.slice(startMonthIdx);
    const numMonths = activeMonths.length;

    activeMonths.forEach((month, mi) => {
      let weight: number;
      if (mi === 0) {
        weight = startW;
      } else if (mi === numMonths - 1) {
        weight = currentW;
      } else {
        // Progressive change with some noise
        const progress = mi / (numMonths - 1);
        const baseWeight = startW + totalChange * progress;
        const noise = (rand() - 0.5) * 4; // +/- 2 lbs noise
        weight = Math.round((baseWeight + noise) * 10) / 10;
      }

      allWeighIns.push({
        clientId: client.id,
        clientName: client.name,
        franchise: client.franchise,
        avatar: client.avatar,
        month,
        weight: Math.round(weight * 10) / 10,
        trainer: client.trainer,
      });
    });
  });

  return allWeighIns;
}

const allWeighIns = generateWeightHistory();

// Get all available months
export function getAvailableMonths(): string[] {
  const months = new Set(allWeighIns.map(w => w.month));
  return Array.from(months).sort();
}

// Get all franchise names
export function getFranchiseNames(): string[] {
  const names = new Set(clients.map(c => c.franchise));
  return Array.from(names).sort();
}

// Get monthly weight changes for a specific month
export function getMonthlyWeightChanges(
  month: string,
  franchise?: string
): { losses: MonthlyWeightChange[]; gains: MonthlyWeightChange[]; totalLoss: number; totalGain: number; lossCount: number; gainCount: number } {
  const months = getAvailableMonths();
  const monthIdx = months.indexOf(month);

  if (monthIdx <= 0) {
    return { losses: [], gains: [], totalLoss: 0, totalGain: 0, lossCount: 0, gainCount: 0 };
  }

  const previousMonth = months[monthIdx - 1];
  const currentMonthWeighIns = allWeighIns.filter(w => w.month === month);
  const previousMonthWeighIns = allWeighIns.filter(w => w.month === previousMonth);

  const changes: MonthlyWeightChange[] = [];

  currentMonthWeighIns.forEach(current => {
    const previous = previousMonthWeighIns.find(p => p.clientId === current.clientId);
    if (!previous) return;
    if (franchise && franchise !== 'all' && current.franchise !== franchise) return;

    const change = Math.round((current.weight - previous.weight) * 10) / 10;
    changes.push({
      clientId: current.clientId,
      clientName: current.clientName,
      franchise: current.franchise,
      avatar: current.avatar,
      trainer: current.trainer,
      previousWeight: previous.weight,
      currentWeight: current.weight,
      change,
    });
  });

  // Losses: negative change, sorted by most loss (most negative first)
  const losses = changes
    .filter(c => c.change < 0)
    .sort((a, b) => a.change - b.change);

  // Gains: positive change, sorted by most gain (most positive first)
  const gains = changes
    .filter(c => c.change > 0)
    .sort((a, b) => b.change - a.change);

  const totalLoss = Math.round(losses.reduce((sum, l) => sum + Math.abs(l.change), 0) * 10) / 10;
  const totalGain = Math.round(gains.reduce((sum, g) => sum + g.change, 0) * 10) / 10;

  return {
    losses,
    gains,
    totalLoss,
    totalGain,
    lossCount: losses.length,
    gainCount: gains.length,
  };
}

// Get yearly weight changes (start weight to current weight)
export function getYearlyWeightChanges(
  franchise?: string
): { losses: YearlyWeightChange[]; totalLoss: number; lossCount: number } {
  const yearlyChanges: YearlyWeightChange[] = [];

  clients.forEach(client => {
    if (franchise && franchise !== 'all' && client.franchise !== franchise) return;

    const totalChange = client.weight - client.startWeight;
    const percentChange = Math.round((totalChange / client.startWeight) * 1000) / 10;

    yearlyChanges.push({
      clientId: client.id,
      clientName: client.name,
      franchise: client.franchise,
      avatar: client.avatar,
      trainer: client.trainer,
      startWeight: client.startWeight,
      currentWeight: client.weight,
      totalChange: Math.round(totalChange * 10) / 10,
      percentChange,
    });
  });

  // Losses: negative change, sorted by most loss
  const losses = yearlyChanges
    .filter(c => c.totalChange < 0)
    .sort((a, b) => a.totalChange - b.totalChange);

  const totalLoss = Math.round(losses.reduce((sum, l) => sum + Math.abs(l.totalChange), 0) * 10) / 10;

  return {
    losses,
    totalLoss,
    lossCount: losses.length,
  };
}

// Get month display label
export function getMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

// Get full month display label
export function getMonthLabelFull(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}
