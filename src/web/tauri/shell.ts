export class Command {
  static create(_program: string, _args: string[] = []): Command {
    return new Command()
  }

  async execute(): Promise<{ code: number; stdout: string; stderr: string }> {
    return { code: 0, stdout: '', stderr: '' }
  }
}
