import mongoose, { Schema, Document } from 'mongoose';
import { EventStatus, MarketStatus } from '@/core/betting/types/bet.types';

export interface IEventOddSubDoc {
  id: string;
  value: number;
}

export interface IEventMarketSubDoc {
  id: string;
  name: string;
  status: MarketStatus;
  result?: string | null;
  odds: IEventOddSubDoc[];
}

export interface IEventDocument extends Document {
  id: string;
  name: string;
  category: string;
  startDate: Date;
  status: EventStatus;
  participants: string[];
  markets: IEventMarketSubDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<IEventDocument>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['SCHEDULED', 'LIVE', 'FINISHED', 'CANCELED'],
      default: 'SCHEDULED',
      index: true,
    },
    participants: {
      type: [String],
      required: true,
    },
    markets: [
      {
        _id: false,
        id: { type: String, required: true },
        name: { type: String, required: true },
        status: {
          type: String,
          enum: ['OPEN', 'SUSPENDED', 'CLOSED'],
          default: 'OPEN',
        },
        result: { type: String, default: null },
        odds: [
          {
            _id: false,
            id: { type: String, required: true },
            value: { type: Number, required: true, min: 1.0 },
          },
        ],
      },
    ],
  },
  { timestamps: true, collection: 'events' },
);

eventSchema.index({ status: 1, startDate: 1 });

export const EventModel = mongoose.model<IEventDocument>('Event', eventSchema);