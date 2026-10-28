/**
 * API contract descriptions for checkJs. Runtime data is owned by the Spring Boot API.
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} sku
 * @property {string} name
 * @property {string} latinName
 * @property {string} category
 * @property {string} description
 * @property {string} sizeLabel
 * @property {string} care
 * @property {number} priceYen
 * @property {string} unit
 * @property {string} imageUrl
 * @property {string} badge
 * @property {number} stock
 * @property {string} source
 * @property {string} sourceUpdatedAt
 * @property {string} nurseryName
 * @property {string} nurseryAddress
 * @property {string} sunlight
 * @property {string} useCase
 * @property {number} careLevel
 * @property {number|null} minTemperatureC
 * @property {boolean} heatTolerant
 * @property {boolean} droughtTolerant
 * @property {number|null} ageYears
 * @property {number|null} heightCm
 * @property {number|null} potDiameterCm
 * @property {string} familyName
 * @property {string} publishedAt
 * @property {boolean} active
 * @property {string} publicationStatus
 * @property {string[]} images
 * @property {PlantModelProfile|null} [plantModelProfile]
 * @property {object|null} [modelComposition]
 * @property {string|null} [canvasMaterialCode]
 * @property {number|null} [sellerStoreId] Store that introduces this product (EC-B05).
 *
 * @typedef {{id:number, name:string, address:string, hours:string, distanceKm:number|null}} Store
 * @typedef {{product:Product, quantity:number, lineTotalYen:number, available:boolean}} CartLine
 * @typedef {{guest?:boolean,revision:number, storeId:number, storeName:string, items:CartLine[], totalYen:number, itemCount:number, canCheckout:boolean, subtotalYen:number, shippingFeeYen:number, details:DeliveryDetails}} Cart
 * @typedef {{revision:number,storeId:number,items:{productId:string,quantity:number}[]}} GuestCartPlan
 * @typedef {{productId:string, sku:string, name:string, quantity:number, unitPriceYen:number, lineTotalYen:number, imageUrl:string|null}} OrderLine
 * @typedef {{id:string, status:string, storeId:number, buyerMemberId:string, pickupAddress:string,pickupHours:string,readyAt:string|null,pickedUpAt:string|null,cancellationStatus:string,cancellationReason:string,cancellationResponse:string, createdAt:string, storeName:string, totalYen:number, items:OrderLine[], subtotalYen:number, shippingFeeYen:number, details:DeliveryDetails}} Order
 * @typedef {{recipientName:string,recipientPhone:string,contactEmail:string}} PickupInput
 * @typedef {{fulfillmentMethod:string, paymentMethod:string, recipientName:string, recipientPhone:string, contactEmail:string, postalCode:string, addressLine1:string, addressLine2:string, requestedDate:string, timeSlot:string}} DeliveryDetails
 * @typedef {Omit<Product,'id'|'unit'|'source'|'sourceUpdatedAt'|'publishedAt'|'active'|'publicationStatus'|'modelComposition'|'canvasMaterialCode'> & {storeId:number}} ProductInput
 * @typedef {{botanicalForm?:string|null,plantType:string,heightCm:number,widthCm:number,crownShape:string,branchCount:number,branchAngle:number,trunkThicknessCm:number,leafShape:string,leafSizeCm:number,leafDensity:string,leafColor:string,flowerEnabled:boolean,flowerShape:string,flowerSizeCm:number,flowerColor:string,seed:number}} PlantModelProfile
 * @typedef {{name:string,latinName:string,category:string,description:string,heightCm:number|null,currentProfile:PlantModelProfile,imageUrl:string|null,imageDataUrl:string|null}} PlantSuggestionInput
 * @typedef {{profile:PlantModelProfile,estimatedFields:string[],warnings:string[]}} PlantSuggestion
 * @typedef {{requestId:string, revision:number, expectedTotalYen:number, paymentMethod:string}} Checkout
 * @typedef {{materialCode:string, quantity:number, unit:string}} MaterialItem
 * @typedef {{materialCode:string, status:string, candidates:{product:Product, purchaseQuantity:number, lineTotalYen:number, available:boolean}[]}} MaterialMatch
 * @typedef {{gardenId:string,name:string,revision:number,updatedAt:string,productCount:number,itemCount:number,thumbnailVersion:string}} ShoppingSummary
 * @typedef {{id:string,name:string,imageUrl:string,priceYen:number,stock:number,active:boolean}} ShoppingProduct
 * @typedef {{key:string,name:string,quantity:number,unit:string,products:ShoppingProduct[]}} ShoppingLine
 * @typedef {{gardenId:string,name:string,revision:number,updatedAt:string,storeId:number,storeName:string,items:ShoppingLine[],listRevision:number}} ShoppingDetail
 * @typedef {{key:string,productId:string}} ShoppingSelection
 * @typedef {{gardenRevision:number,cartRevision:number,listRevision:number,items:ShoppingSelection[]}} ShoppingTransferInput
 * @typedef {{productId:string,name:string,quantity:number,code:string,message:string}} ShoppingOutcome
 * @typedef {{cart:Cart,gardenId:string,gardenName:string,added:ShoppingOutcome[],skipped:ShoppingOutcome[]}} ShoppingTransfer
 */
export {};
