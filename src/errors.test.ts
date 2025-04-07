import errors from "./errors"

describe("errors.is", () => {
  class CustomError extends Error {}
  class AnotherError extends Error {}

  it("should correctly identify error instances", () => {
    const error = new CustomError()
    expect(errors.is(error, CustomError)).toBe(true)
    expect(errors.is(error, AnotherError)).toBe(false)
  })

  it("should handle exact instance matching", () => {
    const error1 = new CustomError()
    const error2 = new CustomError()
    expect(errors.is(error1, error1)).toBe(true)
    expect(errors.is(error1, error2)).toBe(false)
  })

  it("should handle non-error values", () => {
    expect(errors.is("not an error", CustomError)).toBe(false)
    expect(errors.is(null, CustomError)).toBe(false)
    expect(errors.is(undefined, CustomError)).toBe(false)
    expect(errors.is({}, CustomError)).toBe(false)
  })
})

describe("errors.wrap", () => {
  it("should return error instances unchanged", () => {
    const error = new Error("test")
    expect(errors.wrap(error)).toBe(error)
  })

  it("should wrap non-error values", () => {
    const wrapped = errors.wrap("test message")
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toBe("unknown error")
    expect(wrapped.cause).toBe("test message")
  })

  it("should handle various non-error types", () => {
    const cases = [123, null, undefined, { custom: "object" }, ["array"], true]

    for (const value of cases) {
      const wrapped = errors.wrap(value)
      expect(wrapped).toBeInstanceOf(Error)
      expect(wrapped.cause).toBe(value)
    }
  })
})

describe("errors.as", () => {
  class CustomError extends Error {}
  class ChildError extends CustomError {}
  class AnotherError extends Error {}

  it("should return the error if it matches the target type", () => {
    const error = new CustomError()
    const result = errors.as(error, CustomError)
    expect(result).toBe(error)
  })

  it("should return undefined if the error doesn't match the target type", () => {
    const error = new Error()
    const result = errors.as(error, CustomError)
    expect(result).toBeUndefined()
  })

  it("should handle subclasses correctly", () => {
    const error = new ChildError()
    const result = errors.as(error, CustomError)
    expect(result).toBe(error)
  })

  it("should return undefined for non-error values", () => {
    const result = errors.as("not an error", CustomError)
    expect(result).toBeUndefined()
  })

  it("should find matching error in the cause chain", () => {
    const customError = new CustomError()
    const error = new Error("wrapper", { cause: customError })
    const result = errors.as(error, CustomError)
    expect(result).toBe(customError)
  })

  it("should find matching error in a deep cause chain", () => {
    const customError = new CustomError()
    const level3 = new Error("level 3", { cause: customError })
    const level2 = new Error("level 2", { cause: level3 })
    const level1 = new Error("level 1", { cause: level2 })

    const result = errors.as(level1, CustomError)
    expect(result).toBe(customError)
  })

  it("should return undefined if no matching error is found in the chain", () => {
    const level3 = new Error("level 3")
    const level2 = new Error("level 2", { cause: level3 })
    const level1 = new Error("level 1", { cause: level2 })

    const result = errors.as(level1, CustomError)
    expect(result).toBeUndefined()
  })

  it("should handle cause being non-error values", () => {
    const error = new Error("wrapper", { cause: "string cause" })
    const result = errors.as(error, CustomError)
    expect(result).toBeUndefined()
  })
})

describe("errors.catch", () => {
  class CustomError extends Error {}
  class AnotherError extends Error {}

  describe("without error types", () => {
    it("should return success value when no error thrown", () => {
      const result = errors.catch(() => "success")
      expect(result).toBe("success")
    })

    it("should wrap thrown errors", () => {
      const result = errors.catch(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "error message"
      })
      expect(result).toBeInstanceOf(Error)
      expect(result.cause).toBe("error message")
    })

    it("should return thrown Error instances directly", () => {
      const error = new CustomError()
      const result = errors.catch(() => {
        throw error
      })
      expect(result).toBe(error)
    })
  })

  describe("with error types", () => {
    it("should catch matching errors", () => {
      const error = new CustomError()
      const result = errors.catch(() => {
        throw error
      }, CustomError)
      expect(result).toBe(error)
    })

    it("should rethrow non-matching errors", () => {
      expect(() => {
        errors.catch(() => {
          throw new AnotherError()
        }, CustomError)
      }).toThrow(AnotherError)
    })

    it("should catch errors matching any provided type", () => {
      const error = new CustomError()
      const result = errors.catch(
        () => {
          throw error
        },
        AnotherError,
        CustomError,
      )
      expect(result).toBe(error)
    })

    it("should handle success case", () => {
      const result = errors.catch(() => "success", CustomError)
      expect(result).toBe("success")
    })

    it("should match exact error instances", () => {
      const errorInstance = new CustomError()
      const result = errors.catch(() => {
        throw errorInstance
      }, errorInstance)
      expect(result).toBe(errorInstance)
    })
  })
})
