export class RunnerManager {
  constructor(storageKey) {
    this.storageKey = storageKey;
    this.runners = [];
    this.load();
  }

  add(runner) {
    this.runners.push(runner);
    this.save();
  }

  remove(idx) {
    this.runners.splice(idx, 1);
    this.save();
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.runners));
  }

  load() {
    const data = localStorage.getItem(this.storageKey);
    if (data) {
      try {
        const arr = JSON.parse(data);
        if (Array.isArray(arr)) {
          this.runners = arr;
        }
      } catch {}
    }
  }

  renderTable(tableSelector) {
    const tbody = document.querySelector(tableSelector);
    tbody.innerHTML = '';
    this.runners.forEach((runner, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${runner.name}</td>
        <td>${runner.address || ''}</td>
        <td><button class="btn btn-danger btn-sm" data-idx="${idx}">Delete</button></td>
      `;
      tbody.appendChild(tr);
    });
  }
}
