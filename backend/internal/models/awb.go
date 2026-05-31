package models

import (
	"time"

	"gorm.io/gorm"
)

// AWBData — Air Waybill данные по стандарту IATA
type AWBData struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	OrderID *uint  `json:"order_id"`
	Order   *Order `gorm:"foreignKey:OrderID" json:"order,omitempty"`

	// Файл
	FileKey string `json:"file_key"` // MinIO object key
	FileURL string `json:"file_url"` // Public URL

	// AWB номер (формат IATA: XXX-XXXXXXXX)
	AWBNumber string `json:"awb_number"`

	// Грузоотправитель (Shipper)
	ShipperName      string `json:"shipper_name"`
	ShipperAddress   string `json:"shipper_address"`
	ShipperAccountNo string `json:"shipper_account_no"`

	// Грузополучатель (Consignee)
	ConsigneeName      string `json:"consignee_name"`
	ConsigneeAddress   string `json:"consignee_address"`
	ConsigneeAccountNo string `json:"consignee_account_no"`

	// Агент перевозчика
	IssuingAgentName string `json:"issuing_agent_name"`
	IssuingAgentCity string `json:"issuing_agent_city"`
	AgentIATACode    string `json:"agent_iata_code"`
	AgentAccountNo   string `json:"agent_account_no"`

	// Маршрут
	AirportOfDeparture   string `json:"airport_of_departure"`
	AirportOfDestination string `json:"airport_of_destination"`
	FirstCarrier         string `json:"first_carrier"`
	RoutingDestination1  string `json:"routing_destination_1"`
	RoutingCarrier1      string `json:"routing_carrier_1"`
	RequestedFlightDate  string `json:"requested_flight_date"`

	// Учётная информация
	AccountingInfo       string `json:"accounting_info"`
	ReferenceNumber      string `json:"reference_number"`
	OptionalShippingInfo string `json:"optional_shipping_info"`

	// Оплата
	Currency             string `json:"currency"`
	ModeOfPayment        string `json:"mode_of_payment"` // Prepaid / Collect
	WeightValCharge      string `json:"weight_val_charge"` // PP / CC
	OtherChargeCode      string `json:"other_charge_code"`  // PP / CC
	DeclaredValueCarriage string `json:"declared_value_carriage"` // NVD или сумма
	DeclaredValueCustoms  string `json:"declared_value_customs"`  // NCV или сумма

	// Страховка
	InsuranceAmount string `json:"insurance_amount"`

	// Обработка
	HandlingInfo string `json:"handling_info"`
	SCICode      string `json:"sci_code"`

	// Груз
	NumberOfPieces  int     `json:"number_of_pieces"`
	GrossWeight     float64 `json:"gross_weight"`
	WeightUnit      string  `json:"weight_unit"` // K=кг, L=фунты
	RateClass       string  `json:"rate_class"`
	CommodityItemNo string  `json:"commodity_item_no"`
	ChargeableWeight float64 `json:"chargeable_weight"`
	Rate            float64 `json:"rate"`
	Total           float64 `json:"total"`
	GoodsDescription string `json:"goods_description"`
	VolumeCBM       float64 `json:"volume_cbm"`

	// Сборы
	PrepaidWeightCharge   float64 `json:"prepaid_weight_charge"`
	CollectWeightCharge   float64 `json:"collect_weight_charge"`
	ValuationCharge       float64 `json:"valuation_charge"`
	Tax                   float64 `json:"tax"`
	OtherChargesAgent     float64 `json:"other_charges_agent"`
	OtherChargesCarrier   float64 `json:"other_charges_carrier"`
	TotalPrepaid          float64 `json:"total_prepaid"`
	TotalCollect          float64 `json:"total_collect"`

	// Исполнение
	ExecutionDate  string `json:"execution_date"`
	ExecutionTime  string `json:"execution_time"`
	ExecutionPlace string `json:"execution_place"`
	SignerName     string `json:"signer_name"`
}
