export class Runner {
  constructor(name, address, isHost) {
    this.name = name;
    this.address = address;
    this.isHost = isHost;

    if(this.address == "") {
      this.address = null;
    }
  }
}
