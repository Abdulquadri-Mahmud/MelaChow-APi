class RedisMock {
  constructor() {
    this.store = new Map();
    this.isOpen = true;
  }

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key, value) {
    this.store.set(key, value);
    return "OK";
  }

  async del(key) {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async quit() {
    this.isOpen = false;
    return "OK";
  }

  async disconnect() {
    this.isOpen = false;
  }

  on() {
    return this;
  }

  duplicate() {
    return new RedisMock();
  }
}

module.exports = RedisMock;
