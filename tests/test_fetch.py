import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fetch as f  # importing does not fetch anything; main() only runs as a script


def e(title="Event", desc="", **kw):
    base = {"title": title, "description": desc[:300], "_d": desc, "_age": "", "_kids": None,
            "price_text": None, "is_free": None, "price_source": None}
    base.update(kw)
    return base


class PriceSteps(unittest.TestCase):
    def settle(self, **kw):
        x = e(**kw); f.settle_price(x, x["_d"]); return x

    def test_structured_price_is_step_a(self):
        x = self.settle(price_text="$20"); self.assertEqual((x["price_text"], x["price_source"]), ("$20", "a"))

    def test_structured_free_is_step_a(self):
        x = self.settle(is_free=True); self.assertEqual((x["price_text"], x["price_source"]), ("Free", "a"))

    def test_description_free_has_tilde_and_sets_is_free(self):
        x = self.settle(desc="Come on out. Free admission for everyone!")
        self.assertEqual((x["price_text"], x["price_source"], x["is_free"]), ("~Free", "c", True))

    def test_description_dollar_amount_uses_lowest(self):
        x = self.settle(desc="Tickets $15 in advance, $20 at the door")
        self.assertEqual((x["price_text"], x["price_source"]), ("~$15", "c"))

    def test_donation(self):
        self.assertEqual(self.settle(desc="Suggested donation at the door")["price_text"], "~Donation")

    def test_not_fooled_by_gluten_free_or_prizes(self):
        for d in ("gluten free menu", "feel free to bring a friend", "win a $500 prize", "$10 off your first class"):
            self.assertEqual(self.settle(desc=d)["price_source"], "d", d)

    def test_nothing_found_is_step_d(self):
        x = self.settle(desc="A fun night"); self.assertEqual((x["price_text"], x["price_source"]), ("Click for $", "d"))

    def test_existing_source_is_not_overwritten(self):
        x = self.settle(price_text="Paid · click for $", price_source="d", desc="Free entry")
        self.assertEqual(x["price_text"], "Paid · click for $")


class KidsAndAge(unittest.TestCase):
    def test_keywords(self):
        for t in ("Kids Book Club", "Family Story Time", "Teen Night", "Baby and Toddler Story Time", "Homework Help"):
            self.assertTrue(f.is_kids(e(t)), t)

    def test_adult_events_kept(self):
        for t in ("Standup Comedy Showcase", "Pottery Wheel Night", "Jazz at the Lounge"):
            self.assertFalse(f.is_kids(e(t)), t)

    def test_age_range_in_description(self):
        self.assertTrue(f.is_kids(e("Make Something", "Come create! For ages 6 to 13.")))

    def test_source_audience_overrides_keywords(self):
        self.assertFalse(f.is_kids(e("Family Game Night", _kids=False)))
        self.assertTrue(f.is_kids(e("Quiet Night", _kids=True)))

    def test_age_pill(self):
        self.assertEqual(f.age_min(e("Party", "21+ only")), 21)
        self.assertEqual(f.age_min(e("Show", "", _age="18 and older")), 18)
        self.assertIsNone(f.age_min(e("Open to all")))


class Parsers(unittest.TestCase):
    def test_coursehorse_start_time(self):
        self.assertEqual(f.ch_start("6:30–9:30pm CT"), (18, 30))
        self.assertEqual(f.ch_start("10:30am–12:30pm CT"), (10, 30))
        self.assertEqual(f.ch_start("11:30-1:30pm CT"), (11, 30))

    def test_coursehorse_kids(self):
        self.assertTrue(f.ch_kids("14 and older"))
        self.assertIsNone(f.ch_kids("18 and older"))
        self.assertTrue(f.ch_kids("Ages 5-12"))

    def test_ra_price(self):
        self.assertEqual(f.ra_price("$0"), {"is_free": True})
        self.assertEqual(f.ra_price("20+"), {"is_free": False, "price_text": "From $20"})
        self.assertEqual(f.ra_price("$15-20")["price_text"], "From $15")
        self.assertEqual(f.ra_price("Free before 11"), {})
        self.assertEqual(f.ra_price(""), {})

    def test_dostuff_price(self):
        self.assertEqual(f.dostuff_price({"ticket_info": "$28.84"})["price_text"], "$28.84")
        self.assertEqual(f.dostuff_price({"ticket_info": "16+, $63, $73"})["price_text"], "From $63")
        self.assertTrue(f.dostuff_price({"ticket_info": "Free, 21+"})["is_free"])
        self.assertTrue(f.dostuff_price({"ticket_info": "", "free_event": True})["is_free"])
        self.assertEqual(f.dostuff_price({"ticket_info": "All Ages"}), {})

    def test_devalue_decodes_sveltekit_payload(self):
        # {"a": [1, 2], "b": "x"} in devalue's flat form
        self.assertEqual(f.devalue([{"a": 1, "b": 4}, [2, 3], 10, 20, "x"]), {"a": [10, 20], "b": "x"})

    def test_dedupe_title_normalisation(self):
        self.assertEqual(f.norm_title("The Comedy  Night!"), f.norm_title("comedy night"))

    def test_money(self):
        self.assertEqual(f.dollars(15), "$15"); self.assertEqual(f.dollars(22.5), "$22.50")


if __name__ == "__main__":
    unittest.main()
