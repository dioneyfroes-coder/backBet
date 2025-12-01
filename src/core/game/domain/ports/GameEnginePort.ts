export interface GameEnginePort<Input, Result> {
  play(input: Input): Result;
}
