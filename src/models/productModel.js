import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    brand: {
      type: String,
      required: true,
      trim: true
    },

    price: {
      type: Number,
      required: true,
      min: 0
    },

    category: {
      type: String,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    inStock: {
      type: Boolean,
      default: true
    },

    warrantyPeriod: {
      type: String
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 1
    }
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

export default Product;
