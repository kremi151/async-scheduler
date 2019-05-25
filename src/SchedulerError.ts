export default class SchedulerError {

    private readonly _code: number;
    private readonly _message: string;

    constructor(code: number, message: string) {
        this._code = code;
        this._message = message;
    }

    get code(): number {
        return this._code;
    }

    get message(): string {
        return this._message;
    }

}