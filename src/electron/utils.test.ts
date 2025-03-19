import { vi, describe, it, test, expect } from 'vitest'
import { validateEventFrame } from './utils'
import { WebFrameMain } from 'electron'

describe("Utils", () => {
    describe("Validation", async () => {
        it("should error without a frame", () => {
            expect(() => validateEventFrame(null)).toThrowError(/Invalid Frame/i);
        })

        it("should return undefined if dev and localhost:5123", () => {
            vi.stubEnv("NODE_ENV", 'development')
            const frame: Partial<WebFrameMain> = {
                url: "http://localhost:5123"
            }

            expect(validateEventFrame(frame as WebFrameMain)).toBeUndefined()
        })

        it("should throw if not dev and localhost:5123", () => {
            vi.stubEnv("NODE_ENV", 'production')
            const frame: Partial<WebFrameMain> = {
                url: "http://localhost:5123"
            }

            expect(() => validateEventFrame(frame as WebFrameMain)).toThrow()
        })

        it("should throw if  dev and not localhost:5123", () => {
            vi.stubEnv("NODE_ENV", 'development')
            const frame: Partial<WebFrameMain> = {
                url: "http://localhost:123"
            }

            expect(() => validateEventFrame(frame as WebFrameMain)).toThrow()
        })
        it("it should throw if not dev and path is not file://", () => {
            vi.stubEnv("NODE_ENV", 'production')
            const frame: Partial<WebFrameMain> = {
                url: "file://localhost:5123"
            }

            expect(() => validateEventFrame(frame as WebFrameMain)).toThrow()
        })

    })
})