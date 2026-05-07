/**
 * Repository base — typed CRUD operations over Mongoose models.
 *
 * All methods return Result<T, E> — never throw in business logic.
 * Tenant isolation enforced at repository level.
 */
import type {
  Document,
  FilterQuery,
  Model,
  UpdateQuery,
  QueryOptions,
} from "mongoose";
import { type Result, ok, err, tryAsync } from "@bureau/shared-kernel";
import { TaskNotFoundError } from "@bureau/shared-kernel";

export interface FindOptions {
  skip?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

/**
 * Base repository providing typed CRUD with Result<T,E> return types.
 * All queries include tenantId for data isolation.
 */
export class BaseRepository<TDoc extends Document & { tenantId: string }> {
  constructor(protected readonly model: Model<TDoc>) {}

  /** Find one document by ID, scoped to tenant */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<Result<TDoc, TaskNotFoundError>> {
    const result = await tryAsync(async () => {
      const doc = await this.model
        .findOne({ _id: id, tenantId } as FilterQuery<TDoc>)
        .lean()
        .exec();
      return doc as TDoc | null;
    });

    if (!result.ok) {
      return err(new TaskNotFoundError(id));
    }

    if (result.value === null) {
      return err(new TaskNotFoundError(id));
    }

    return ok(result.value);
  }

  /** Find multiple documents, scoped to tenant */
  async findMany(
    filter: FilterQuery<TDoc>,
    tenantId: string,
    options: FindOptions = {},
  ): Promise<Result<TDoc[], Error>> {
    return tryAsync(async () => {
      const query = this.model
        .find({ ...filter, tenantId })
        .skip(options.skip ?? 0)
        .limit(options.limit ?? 50);

      if (options.sort) {
        query.sort(options.sort);
      }

      return (await query.lean().exec()) as TDoc[];
    });
  }

  /** Create a new document */
  async create(data: Partial<TDoc>): Promise<Result<TDoc, Error>> {
    return tryAsync(async () => {
      const doc = new this.model(data);
      return (await doc.save()) as TDoc;
    });
  }

  /** Update one document atomically */
  async updateOne(
    filter: FilterQuery<TDoc>,
    update: UpdateQuery<TDoc>,
    options?: QueryOptions<TDoc>,
  ): Promise<Result<TDoc | null, Error>> {
    return tryAsync(async () => {
      const doc = await this.model
        .findOneAndUpdate(filter, update, {
          new: true,
          runValidators: true,
          ...options,
        })
        .exec();
      return doc as TDoc | null;
    });
  }

  /** Count documents in tenant scope */
  async count(
    filter: FilterQuery<TDoc>,
    tenantId: string,
  ): Promise<Result<number, Error>> {
    return tryAsync(async () =>
      this.model.countDocuments({ ...filter, tenantId }).exec(),
    );
  }

  /** Check existence */
  async exists(
    filter: FilterQuery<TDoc>,
    tenantId: string,
  ): Promise<Result<boolean, Error>> {
    const result = await tryAsync(async () =>
      this.model.exists({ ...filter, tenantId }).exec(),
    );
    if (!result.ok) return result;
    return ok(result.value !== null);
  }
}
