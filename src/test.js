const numbers = [2, 2, 3, 4];
// reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: number[]) => number, initialValue: number): number

const sum = numbers.reduce((acc, num, index, sum) => {
  console.log(`acc: ${acc}`);
  console.log(`num: ${num}`);
  console.log(`index: ${index}`);
  console.log(`sum: ${sum}`);

  return acc + num;
}, 0);
