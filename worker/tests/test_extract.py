from conftest import MODERN_SITE, OLD_SITE

from crm_worker.extract import extract_facts


def test_old_site_facts():
    f = extract_facts(OLD_SITE, "http://kingsheathplumbing.co.uk/", "Birmingham", current_year=2026)
    assert f["has_viewport"] is False
    assert f["copyright_year"] == 2016
    assert "jQuery 1.8.3" in f["old_tech"] and "WordPress 4.9.8" in f["old_tech"] and "<font> tags" in f["old_tech"]
    assert f["table_layout"] is True
    assert f["contact_form"] is False and f["has_cta"] is False
    assert f["emails"] == ["info@kingsheathplumbing.co.uk"]
    assert "01214441234" in f["phones"]
    assert f["whatsapp_links"] == []
    assert f["local_seo"]["mentions_city"] is False


def test_modern_site_facts():
    f = extract_facts(MODERN_SITE, "https://brummiesparks.co.uk/", "Birmingham", current_year=2026)
    assert f["has_viewport"] is True
    assert f["title"].startswith("Electrician Birmingham")
    assert f["contact_form"] is True and f["has_cta"] is True
    assert "Get a free quote" in f["cta_texts"] and "Call now" in f["cta_texts"]
    assert f["whatsapp_links"] == ["https://wa.me/447700900222"]
    assert f["tel_links"] == 1 and "01214445555" in f["phones"]
    assert f["local_seo"] == {"mentions_city": True, "has_postcode": True, "local_business_schema": True}
    assert f["copyright_year"] == 2026
    assert f["old_tech"] == [] and f["table_layout"] is False
    assert f["service_links"] == 2 and f["nav_links"] == 4
    assert len(f["content_hash"]) == 64


def test_no_whatsapp_is_not_assumed():
    f = extract_facts("<html><body><a href='tel:01214440000'>Call</a></body></html>", "https://x.co.uk/")
    assert f["whatsapp_links"] == [] and f["whatsapp_widget"] is False


def test_search_form_is_not_contact_form():
    f = extract_facts("<form role='search' class='search'><input type='text' name='s'></form>", "https://x.co.uk/")
    assert f["forms"] == 1 and f["contact_form"] is False


def test_email_noise_filtered():
    f = extract_facts("<p>logo@2x.png someone@example.com real@firm.co.uk</p>", "https://x.co.uk/")
    assert f["emails"] == ["real@firm.co.uk"]
