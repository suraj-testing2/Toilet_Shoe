function* forEmptyGenerator() {
  yield* [];
}

function accumulate(iterator) {
  var result = '';
  for (var value of iterator) {
    result = result + String(value);
  }
  return result;
}

// ----------------------------------------------------------------------------

assertEquals('', accumulate(forEmptyGenerator()));
