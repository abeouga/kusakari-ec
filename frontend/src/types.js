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
 * @property {number} sellerStoreId The store the product belongs to; it is also the pickup store.
 * @property {string} sellerStoreName
 *
 * @typedef {{id:number, name:string, address:string, hours:string, latitude:number|null, longitude:number|null, distanceKm:number|null}} Store
 * storeId/storeName: the line's pickup store, which is the product's store (issue #70).
 * @typedef {{product:Product, quantity:number, lineTotalYen:number, available:boolean, storeId:number, storeName:string, unavailableReason:string|null}} CartLine
 * @typedef {{productId:string, name:string, storeName:string, quantity:number, reason:string}} RemovedCartLine
 * @typedef {{revision:number, items:CartLine[], totalYen:number, itemCount:number, canCheckout:boolean, subtotalYen:number, details:DeliveryDetails, removedItems:RemovedCartLine[]}} Cart
 * @typedef {{productId:string, sku:string, name:string, quantity:number, unitPriceYen:number, lineTotalYen:number, imageUrl:string|null}} OrderLine
 * @typedef {{id:string, status:string, storeId:number, buyerMemberId:string, pickupAddress:string,pickupHours:string,readyAt:string|null,pickedUpAt:string|null,cancellationStatus:string,cancellationReason:string,cancellationResponse:string, createdAt:string, storeName:string, totalYen:number, items:OrderLine[], details:DeliveryDetails, paymentStatus:string|null, refundStatus:string|null, storeClosing:boolean, cancelledBy:'OPERATOR'|'STORE'|null, sales?:SalesFigures|null}} Order
 * sales is the commission, returned to stores and the operator only (issue #130).
 * @typedef {{commissionRateBp:number, commissionYen:number, netYen:number, counted:boolean}} SalesFigures
 * paymentStatus is null for pay-at-store orders; refundStatus is null when nothing was refunded (issue #132/#133).
 * storeClosing is true while the pickup store is closing; cancelledBy tells an operator's cancellation from the store's (issue #79).
 * @typedef {{id:string, status:string, amountYen:number, clientSecret:string|null}} CardPayment
 * @typedef {{orders:Order[], payment:CardPayment|null}} CheckoutResult One order per pickup store (issue #70).
 * @typedef {{orders:Order[], payment:CardPayment}} PendingCardPayment
 * @typedef {{recipientName:string,recipientPhone:string,contactEmail:string}} PickupInput
 * @typedef {{paymentMethod:string, recipientName:string, recipientPhone:string, contactEmail:string}} DeliveryDetails
 * @typedef {Omit<Product,'id'|'unit'|'source'|'sourceUpdatedAt'|'publishedAt'|'active'|'publicationStatus'|'modelComposition'|'canvasMaterialCode'|'sellerStoreId'|'sellerStoreName'> & {storeId:number}} ProductInput
 * @typedef {{botanicalForm?:string|null,plantType:string,heightCm:number,widthCm:number,crownShape:string,branchCount:number,branchAngle:number,trunkThicknessCm:number,leafShape:string,leafSizeCm:number,leafDensity:string,leafColor:string,flowerEnabled:boolean,flowerShape:string,flowerSizeCm:number,flowerColor:string,seed:number} & PlantShape} PlantModelProfile
 * Shape controls; null (or absent in older profiles) lets Canvas use the plant type / species value.
 * @typedef {{stemCount?:number|null,stemCurve?:number|null,stemTaper?:number|null,twigLength?:number|null,branchLevels?:number|null,branchDroop?:number|null,branchStart?:number|null,leafSizeVariation?:number|null,leafTipRatio?:number|null,leafArrangement?:string|null}} PlantShape
 * @typedef {{name:string,latinName:string,category:string,description:string,heightCm:number|null,currentProfile:PlantModelProfile,imageUrl:string|null,imageDataUrl:string|null}} PlantSuggestionInput
 * @typedef {{profile:PlantModelProfile,estimatedFields:string[],warnings:string[]}} PlantSuggestion
 * @typedef {{requestId:string, revision:number, expectedTotalYen:number, paymentMethod:string}} Checkout
 * @typedef {{gardenId:string,name:string,revision:number,updatedAt:string,productCount:number,itemCount:number,thumbnailVersion:string}} ShoppingSummary
 * @typedef {{id:string,name:string,imageUrl:string,priceYen:number,stock:number,active:boolean,storeId:number,storeName:string}} ShoppingProduct
 * @typedef {{key:string,name:string,quantity:number,unit:string,products:ShoppingProduct[]}} ShoppingLine
 * @typedef {{gardenId:string,name:string,revision:number,updatedAt:string,items:ShoppingLine[],listRevision:number}} ShoppingDetail
 * @typedef {{key:string,productId:string}} ShoppingSelection
 * @typedef {{gardenRevision:number,cartRevision:number,listRevision:number,items:ShoppingSelection[]}} ShoppingTransferInput
 * @typedef {{productId:string,name:string,quantity:number,code:string,message:string}} ShoppingOutcome
 * @typedef {{cart:Cart,gardenId:string,gardenName:string,added:ShoppingOutcome[],skipped:ShoppingOutcome[]}} ShoppingTransfer
 */
export {};
