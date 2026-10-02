'use strict';
self.onmessage = function(event) {
  const numbers = new Float64Array(event.data.buffer);
  let checksum = 0;
  for (let i = 0; i < numbers.length; i++) {
    numbers[i] *= numbers[i];
    checksum += numbers[i];
  }
  self.postMessage({checksum: checksum, buffer: numbers.buffer}, [numbers.buffer]);
};
